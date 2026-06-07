import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { getCurrentInstruction, getCurrentSpeechLanguageCode, getCurrentVoiceId } from "./configService";
import { getCurrentApiKey } from "./apiKeyService";

const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export class LiveSessionManager {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private inputMonitorGain: GainNode | null = null;
  private isLiveReady: boolean = false;
  private isUserSpeaking: boolean = false;
  private silenceMs: number = 0;
  
  // Audio playback state
  private playbackContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextPlayTime: number = 0;
  private isPlaying: boolean = false;
  
  private _outputVolume: number = 1.0;
  public get outputVolume(): number { return this._outputVolume; }
  public set outputVolume(v: number) {
    this._outputVolume = v;
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(v, this.playbackContext?.currentTime || 0);
    }
  }
  
  public isMuted: boolean = false;
  public isInputMuted: boolean = false;
  public expectTextOnly: boolean = false;
  
  public onStateChange: (state: "idle" | "listening" | "processing" | "speaking") => void = () => {};
  public onMessage: (sender: "user" | "zoya", text: string) => void = () => {};
  public onCommand: (url: string) => void = () => {};
  public onNotepadUpdate: (content: string) => void = () => {};
  public onMemorySave: (content: string) => void = () => {};
  public onError: (error: unknown) => void = () => {};

  constructor(private userName?: string) {
    this.ai = new GoogleGenAI({ apiKey: getCurrentApiKey() });
  }

  async start() {
    try {
      this.onStateChange("processing");
      
      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      if (this.playbackContext.state === "suspended") {
        await this.playbackContext.resume();
      }
      this.gainNode = this.playbackContext.createGain();
      this.gainNode.gain.value = this._outputVolume;
      this.gainNode.connect(this.playbackContext.destination);
      this.nextPlayTime = this.playbackContext.currentTime;

      // Get Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.sessionPromise || !this.isLiveReady || this.isInputMuted) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const rms = this.getRms(inputData);
        const pcm16 = this.floatTo16BitPcm(inputData, e.inputBuffer.sampleRate, 16000);
        const chunkMs = (pcm16.length / 16000) * 1000;

        if (rms < 0.004) {
          if (this.isUserSpeaking) {
            this.silenceMs += chunkMs;
            if (this.silenceMs >= 700) {
              this.sessionPromise.then(session => {
                session.sendRealtimeInput({ audioStreamEnd: true });
              }).catch(err => console.error("Error ending audio stream", err));
              this.isUserSpeaking = false;
              this.silenceMs = 0;
            }
          }
          return;
        }

        this.isUserSpeaking = true;
        this.silenceMs = 0;
        const base64Data = this.pcm16ToBase64(pcm16);

        this.sessionPromise.then(session => {
          session.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }).catch(err => console.error("Error sending audio", err));
      };

      this.inputMonitorGain = this.audioContext.createGain();
      this.inputMonitorGain.gain.value = 0;
      this.inputMonitorGain.connect(this.audioContext.destination);
      this.source.connect(this.processor);
      this.processor.connect(this.inputMonitorGain);

      // Connect to Live API
      const speechConfig: any = {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: getCurrentVoiceId() } },
        languageCode: getCurrentSpeechLanguageCode(),
      };

      this.sessionPromise = this.ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig,
          systemInstruction: getCurrentInstruction(this.userName),
          inputAudioTranscription: { languageCode: getCurrentSpeechLanguageCode() } as any,
          outputAudioTranscription: { languageCode: getCurrentSpeechLanguageCode() } as any,
          tools: [{
            functionDeclarations: [
              {
                name: "executeBrowserAction",
                description: "Open a website or perform a browser action (like opening YouTube, Spotify, or WhatsApp). Call this when the user asks to open a site, play a song, or send a message.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING, description: "Type of action: 'open', 'youtube', 'spotify', 'whatsapp'" },
                    query: { type: Type.STRING, description: "The search query, website name, or message content." },
                    target: { type: Type.STRING, description: "The target phone number for WhatsApp, if applicable." }
                  },
                  required: ["actionType", "query"]
                }
              },
              {
                name: "updateNotepad",
                description: "Write or update content in the user's Notepad. Call this when the user asks you to write something, save a note, or keep track of information in the Notepad.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    content: { type: Type.STRING, description: "The text to be written or updated in the Notepad." }
                  },
                  required: ["content"]
                }
              },
              {
                name: "saveMemory",
                description: "Save a useful long-term memory about the user. Call this when the user explicitly asks you to remember something, tells you their preference, name, project, goal, or other stable personal context.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    content: { type: Type.STRING, description: "A concise memory fact to remember about the user." }
                  },
                  required: ["content"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            console.log("Live API Connected");
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.setupComplete) {
              this.isLiveReady = true;
              this.onStateChange("listening");
            }

            // Reset text-only flag if turn completes
            if (message.serverContent?.turnComplete) {
              this.expectTextOnly = false;
            }

            // Handle Audio Output
            const base64Audio = message.data || message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && !this.expectTextOnly) {
              this.onStateChange("speaking");
              this.playAudioChunk(base64Audio);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              this.stopPlayback();
              this.onStateChange("listening");
            }

            const inputText = message.serverContent?.inputTranscription?.text;
            if (inputText?.trim()) {
              this.onMessage("user", inputText);
            }

            const outputText = message.serverContent?.outputTranscription?.text;
            if (outputText?.trim()) {
              this.onMessage("zoya", outputText);
            } else {
              const modelText = message.serverContent?.modelTurn?.parts
                ?.map((part) => part.text)
                .filter(Boolean)
                .join("");
              if (modelText?.trim()) {
                this.onMessage("zoya", modelText);
              }
            }

            // Handle Function Calls
            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              for (const call of functionCalls) {
                if (call.name === "executeBrowserAction") {
                  const args = call.args as any;
                  let url = "";
                  if (args.actionType === "youtube") {
                    url = `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "spotify") {
                    url = `https://open.spotify.com/search/${encodeURIComponent(args.query)}`;
                  } else if (args.actionType === "whatsapp") {
                    url = `https://web.whatsapp.com/send?phone=${args.target || ''}&text=${encodeURIComponent(args.query)}`;
                  } else {
                    let website = args.query.replace(/\s+/g, "");
                    if (!website.includes(".")) website += ".com";
                    url = `https://www.${website}`;
                  }
                  
                  this.onCommand(url);
                  
                  // Send tool response
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Action executed successfully in the browser." }
                       }]
                     });
                  });
                } else if (call.name === "updateNotepad") {
                  const args = call.args as any;
                  this.onNotepadUpdate(args.content);
                  
                  // Send tool response
                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Notepad updated successfully." }
                       }]
                     });
                  });
                } else if (call.name === "saveMemory") {
                  const args = call.args as any;
                  this.onMemorySave(String(args.content || ""));

                  this.sessionPromise?.then(session => {
                     session.sendToolResponse({
                       functionResponses: [{
                         name: call.name,
                         id: call.id,
                         response: { result: "Memory saved successfully." }
                       }]
                     });
                  });
                }
              }
            }
          },
          onclose: () => {
            console.log("Live API Closed");
            this.stop();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            this.onError(err);
            this.stop();
          }
        }
      });

    } catch (error) {
      console.error("Failed to start Live Session:", error);
      this.stop();
      this.onError(error);
      throw error;
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.playbackContext || this.isMuted) return;
    
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = this.playbackContext.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0;
      }
      
      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode!);
      
      const currentTime = this.playbackContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }
      
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
      this.isPlaying = true;
      
      source.onended = () => {
        if (this.playbackContext && this.playbackContext.currentTime >= this.nextPlayTime - 0.1) {
          this.isPlaying = false;
          this.onStateChange("listening");
        }
      };
    } catch (e) {
      console.error("Error playing chunk", e);
    }
  }

  private floatTo16BitPcm(inputData: Float32Array, inputSampleRate: number, outputSampleRate: number): Int16Array {
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const outputLength = Math.max(1, Math.floor(inputData.length / sampleRateRatio));
    const output = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i * sampleRateRatio;
      const indexBefore = Math.floor(sourceIndex);
      const indexAfter = Math.min(indexBefore + 1, inputData.length - 1);
      const weight = sourceIndex - indexBefore;
      const sample = inputData[indexBefore] * (1 - weight) + inputData[indexAfter] * weight;
      const clamped = Math.max(-1, Math.min(1, sample));
      output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    return output;
  }

  private getRms(inputData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    return Math.sqrt(sum / inputData.length);
  }

  private pcm16ToBase64(pcm16: Int16Array): string {
    const bytes = new Uint8Array(pcm16.buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private stopPlayback() {
    if (this.playbackContext) {
      this.playbackContext.close();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
      this.gainNode = this.playbackContext.createGain();
      this.gainNode.gain.value = this._outputVolume;
      this.gainNode.connect(this.playbackContext.destination);
      this.nextPlayTime = this.playbackContext.currentTime;
      this.isPlaying = false;
    }
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.inputMonitorGain) {
      this.inputMonitorGain.disconnect();
      this.inputMonitorGain = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    this.isLiveReady = false;
    this.isUserSpeaking = false;
    this.silenceMs = 0;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.stopPlayback();
    
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close()).catch(() => {});
      this.sessionPromise = null;
    }
    
    this.onStateChange("idle");
  }

  sendText(text: string) {
    if (this.sessionPromise) {
      this.expectTextOnly = true;
      this.sessionPromise.then(session => {
        session.send({ parts: [{ text }] });
      });
    }
  }
}
