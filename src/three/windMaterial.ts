import * as THREE from 'three';

export interface WindUniforms {
  uTime: { value: number };
  uPointer: { value: THREE.Vector3 };
  uPush: { value: number };
  uWind: { value: number };
}

/**
 * Standard material + GPU wind. Each instance sways with a phase from its position,
 * and blades within a radius of the cursor's ground point lean away from it.
 * All in the vertex shader, so thousands of crops cost almost nothing on the CPU.
 */
export function createWindMaterial(color: THREE.ColorRepresentation, height: number, vertexColors = true) {
  const uniforms: WindUniforms = {
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector3(999, 0, 999) },
    uPush: { value: 0.35 },
    uWind: { value: 0.06 },
  };
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, vertexColors, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime; uniform vec3 uPointer; uniform float uPush; uniform float uWind;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           float kdH = clamp(transformed.y / ${height.toFixed(3)}, 0.0, 1.0);
           float kdBend = kdH * kdH;
           vec3 kdIp = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
           float kdPh = kdIp.x * 0.35 + kdIp.z * 0.27;
           vec2 kdWind = vec2(sin(uTime * 1.3 + kdPh) * 0.6 + sin(uTime * 2.1 + kdPh * 1.7) * 0.25, cos(uTime * 0.9 + kdPh) * 0.3) * uWind;
           vec2 kdTo = kdIp.xz - uPointer.xz;
           float kdDist = length(kdTo);
           float kdPushAmt = uPush * (1.0 - smoothstep(0.0, 1.7, kdDist));
           vec2 kdDir = kdDist > 0.001 ? kdTo / kdDist : vec2(0.0);
           vec2 kdDw = (kdWind + kdDir * kdPushAmt) * kdBend;
           vec3 kdAx = normalize(instanceMatrix[0].xyz);
           vec3 kdAz = normalize(instanceMatrix[2].xyz);
           float kdSc = length(instanceMatrix[0].xyz);
           vec3 kdW = vec3(kdDw.x, 0.0, kdDw.y);
           transformed.x += dot(kdW, kdAx) / kdSc;
           transformed.z += dot(kdW, kdAz) / kdSc;
           transformed.y -= length(kdDw) * 0.3 * kdH / kdSc;
         #endif`,
      );
  };
  mat.customProgramCacheKey = () => `kd-wind-${height}-${vertexColors}`;
  return { material: mat, uniforms };
}
