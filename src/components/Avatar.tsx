import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin } from "@pixiv/three-vrm";

interface AvatarProps {
  url: string;
  state: "idle" | "listening" | "processing" | "speaking";
  isWaving?: boolean;
}

const VRMModel = ({ url, state, isWaving }: AvatarProps) => {
  const vrmRef = useRef<VRM | null>(null);
  const { scene, camera } = useThree();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      url,
      (gltf) => {
        if (!active) return;
        
        if (vrmRef.current) {
          scene.remove(vrmRef.current.scene);
        }

        const vrm = gltf.userData.vrm as VRM;
        vrmRef.current = vrm;
        scene.add(vrm.scene);
        
        vrm.scene.position.set(0, -1.8, 0); 
        vrm.scene.rotation.y = Math.PI;
        vrm.scene.scale.set(1.4, 1.4, 1.4);
        
        if (vrm.lookAt) {
           vrm.lookAt.target = camera;
        }

        setLoaded(true);
      },
      undefined,
      (error) => console.error("Error loading VRM:", error)
    );

    return () => {
      active = false;
      if (vrmRef.current) {
        scene.remove(vrmRef.current.scene);
        vrmRef.current = null;
      }
    };
  }, [url, scene, camera]);

  const timeRef = useRef(0);

  useFrame((stateFrame, delta) => {
    if (vrmRef.current) {
      vrmRef.current.update(delta);

      timeRef.current += delta;
      const t = timeRef.current;
      
      // Apply Pose and Gestures
      if (vrmRef.current.humanoid) {
        const isSpeaking = state === "speaking";
        
        // Base rotations (Arms down)
        let leftArmRotZ = 1.35;
        let rightArmRotZ = -1.35;
        let leftArmRotX = 0;
        let rightArmRotX = 0;
        let leftLowerArmRotX = 0.2;
        let rightLowerArmRotX = 0.2;
        let leftHandRotY = 0;
        let rightHandRotY = 0;

        // Waving Logic (Overrides normal gestures)
        if (isWaving) {
          // Right arm raised and waving
          rightArmRotX = 1.0;
          rightArmRotZ = -0.6;
          rightLowerArmRotX = 1.2 + Math.sin(t * 10) * 0.4; // The wave motion
          rightHandRotY = Math.sin(t * 15) * 0.5;
          
          // Left arm stays neutral or idle
          leftArmRotZ = 1.35;
        } else if (isSpeaking) {
          const t1 = t * 2.2;
          const t2 = t * 1.1;
          const t3 = t * 0.5;
          
          // Confident Forward Lean (Spine/Chest)
          const forwardLean = 0.08 + Math.sin(t3) * 0.02;
          
          // Upper arms: Held slightly away from body, moving from shoulder
          // Z rotation around 1.0 - 1.2 (bent but not T-pose)
          leftArmRotZ = 1.1 + Math.sin(t3) * 0.1;
          rightArmRotZ = -1.1 - Math.cos(t3 * 1.1) * 0.1;
          
          // X rotation (forward motion) - smooth lecture style
          leftArmRotX = 0.4 + Math.sin(t2) * 0.15;
          rightArmRotX = 0.4 + Math.cos(t2 * 0.9) * 0.15;

          // Elbows: Consistently bent at ~90 degrees (1.57 rad)
          leftLowerArmRotX = 1.5 + Math.sin(t1) * 0.3;
          rightLowerArmRotX = 1.5 + Math.cos(t1 * 1.1) * 0.3;
          
          // Hands/Wrists: Open palm gestures
          leftHandRotY = Math.sin(t * 3) * 0.4; // Explaining motion
          rightHandRotY = Math.cos(t * 3.5) * 0.4;
          
          // Apply spine/chest lean
          const chest = vrmRef.current.humanoid.getRawBoneNode("chest") || vrmRef.current.humanoid.getRawBoneNode("Chest" as any);
          const spine = vrmRef.current.humanoid.getRawBoneNode("spine") || vrmRef.current.humanoid.getRawBoneNode("Spine" as any);
          if (spine) spine.rotation.x = forwardLean;
          if (chest) chest.rotation.x = forwardLean * 0.5;
        }

        const bones = [
          { names: ["leftUpperArm", "LeftUpperArm"], r: [leftArmRotX, 0, leftArmRotZ] },
          { names: ["rightUpperArm", "RightUpperArm"], r: [rightArmRotX, 0, rightArmRotZ] },
          { names: ["leftLowerArm", "LeftLowerArm"], r: [leftLowerArmRotX, 0, 0.2] },
          { names: ["rightLowerArm", "RightLowerArm"], r: [rightLowerArmRotX, 0, -0.2] },
          { names: ["leftHand", "LeftHand"], r: [0, leftHandRotY, 0.2] },
          { names: ["rightHand", "RightHand"], r: [0, rightHandRotY, -0.2] }
        ];

        bones.forEach(b => {
          let node = null;
          for (const name of b.names) {
            node = vrmRef.current!.humanoid!.getRawBoneNode(name as any);
            if (node) break;
          }
          if (node) {
            node.rotation.set(b.r[0], b.r[1], b.r[2]);
          }
        });

        // Finger Movements: Mixed open palm and pointing
        if (isSpeaking || isWaving) {
          const fingerBones = ["Thumb", "Index", "Middle", "Ring", "Little"];
          const sides = ["left", "right"];
          sides.forEach(side => {
            if (isWaving && side === "left") return;
            
            fingerBones.forEach(finger => {
              const boneName = `${side}${finger}Proximal`;
              const node = vrmRef.current!.humanoid!.getRawBoneNode(boneName as any);
              if (node) {
                // Occasional "pointing" with index finger
                let fold = 0.3 + Math.sin(t * 8 + (fingerBones.indexOf(finger) * 1.7)) * 0.1;
                if (finger === "Index" && Math.sin(t * 2) > 0.6) {
                  fold = 0.1; // Straighten index for emphasis
                } else if (finger !== "Index" && Math.sin(t * 2) > 0.6) {
                  fold = 0.8; // Curl others while pointing
                }
                node.rotation.z = side === "left" ? fold : -fold;
              }
            });
          });
        }

        // Breathing and idle sway
        const chest = vrmRef.current.humanoid.getRawBoneNode("chest") || vrmRef.current.humanoid.getRawBoneNode("Chest" as any);
        const spine = vrmRef.current.humanoid.getRawBoneNode("spine") || vrmRef.current.humanoid.getRawBoneNode("Spine" as any);
        const head = vrmRef.current.humanoid.getRawBoneNode("head") || vrmRef.current.humanoid.getRawBoneNode("Head" as any);

        if (chest) chest.rotation.x = Math.sin(t * (isSpeaking ? 2.5 : 1.2)) * 0.04;
        if (spine) {
          spine.rotation.y = Math.sin(t * 0.6) * 0.03;
          if (isSpeaking) spine.rotation.z = Math.sin(t * 2) * 0.02;
        }
        if (head) {
          head.rotation.y = Math.sin(t * 0.4) * 0.05 + (isSpeaking ? Math.sin(t * 3) * 0.1 : 0);
          if (isSpeaking) head.rotation.x = Math.sin(t * 8) * 0.03;
        }
      }

      // Blink
      if (vrmRef.current.expressionManager) {
        const blinkValue = Math.sin(t * 4) > 0.97 ? 1 : 0;
        vrmRef.current.expressionManager.setValue("blink", blinkValue);
      }

      // Lip sync
      if (vrmRef.current.expressionManager) {
        if (state === "speaking") {
          const mouthOpen = Math.abs(Math.sin(t * 18)) * 0.8;
          vrmRef.current.expressionManager.setValue("aa", mouthOpen);
        } else {
          vrmRef.current.expressionManager.setValue("aa", 0);
        }
      }
    }
  });

  return null;
};

export default function Avatar({ url, state, isWaving }: AvatarProps) {
  return (
    <div 
      className="w-full h-full absolute inset-0 z-0" 
      style={{ 
        background: "radial-gradient(circle at 50% 50%, #1a0b2e 0%, #050505 100%)" 
      }}
    >
      <Canvas shadows gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 0, 3.8]} fov={30} />
        <Environment preset="night" />
        <ambientLight intensity={0.8} />
        <pointLight position={[2, 2, 2]} intensity={1} color="#a855f7" />
        <spotLight position={[-5, 5, 5]} angle={0.15} penumbra={1} intensity={2} color="#ffffff" castShadow />
        <VRMModel url={url} state={state} isWaving={isWaving} />
        <ContactShadows opacity={0.5} scale={10} blur={2.5} far={1.5} />
      </Canvas>
    </div>
  );
}
