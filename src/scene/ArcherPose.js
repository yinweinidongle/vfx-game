import * as THREE from 'three';

const X_AXIS = new THREE.Vector3(1, 0, 0);
const AIM_TARGET = new THREE.Vector3(7.5, 1.7, 0);
const clamp = THREE.MathUtils.clamp;
const smoothstep = THREE.MathUtils.smoothstep;

/** Deterministic bow-hand contact correction over the supplied Mixamo clip. */
export class ArcherPose {
  constructor(actor, bow) {
    this.actor = actor;
    this.bow = bow;
    const bone = name => actor.root.getObjectByName(`mixamorig${name}`);
    this.leftHand = actor.hand;
    this.leftIndex = bone('LeftHandIndex1');
    this.leftMiddle = bone('LeftHandMiddle1');
    this.rightIndex = bone('RightHandIndex3');
    this.rightMiddle = bone('RightHandMiddle2');
    this.rightHand = actor.drawHand;
    this.rightArm = bone('RightArm');
    this.rightForeArm = bone('RightForeArm');
    this.grip = new THREE.Vector3();
    this.nock = new THREE.Vector3();
    this.direction = new THREE.Vector3(1, 0, 0);
    this.quaternion = new THREE.Quaternion();
    this.releaseNockLocal = new THREE.Vector3();
    this.desiredNock = new THREE.Vector3();
    this.arrowRest = new THREE.Vector3();
    this.leftHandToBow = new THREE.Quaternion();
    this.handQuaternion = new THREE.Quaternion();
    this.bowFollowQuaternion = new THREE.Quaternion();
    this.temp = new THREE.Vector3();
    this.second = new THREE.Vector3();
    this.jointPosition = new THREE.Vector3();
    this.currentDirection = new THREE.Vector3();
    this.targetDirection = new THREE.Vector3();
    this.deltaQuaternion = new THREE.Quaternion();
    this.worldQuaternion = new THREE.Quaternion();
    this.parentQuaternion = new THREE.Quaternion();
    this.baseArmQuaternion = new THREE.Quaternion();
    this.baseForeArmQuaternion = new THREE.Quaternion();
    this.releaseArmCorrection = new THREE.Quaternion();
    this.releaseForeArmCorrection = new THREE.Quaternion();
    this.identityQuaternion = new THREE.Quaternion();
    this.fadeCorrectionQuaternion = new THREE.Quaternion();
    this.lastTime = NaN;
    this.lastPhase = null;
    this.calibrated = false;
    this.hasManualCorrection = false;

    // The clip's fingers start opening after ~0.16 s. Capture full draw before
    // that point, then reserve the rest of the supplied motion for release.
    this.sample(0.75, 'charge');
    this.releaseArmCorrection.copy(this.baseArmQuaternion).invert().premultiply(this.rightArm.quaternion);
    this.releaseForeArmCorrection.copy(this.baseForeArmQuaternion).invert().premultiply(this.rightForeArm.quaternion);
    this.leftHand.getWorldQuaternion(this.handQuaternion);
    this.leftHandToBow.copy(this.handQuaternion).invert().multiply(this.bow.quaternion);
    this.releaseNockLocal.copy(this.nock);
    this.bow.worldToLocal(this.releaseNockLocal);
    this.calibrated = true;
    this.lastTime = NaN;
  }

  readGrip(out) {
    this.leftHand.getWorldPosition(out);
    if (this.leftIndex && this.leftMiddle) {
      this.leftIndex.getWorldPosition(this.temp);
      this.leftMiddle.getWorldPosition(this.second);
      this.temp.add(this.second).multiplyScalar(0.5);
      out.lerp(this.temp, 0.5);
    }
    return out;
  }

  readNock(out) {
    if (this.rightIndex && this.rightMiddle) {
      this.rightIndex.getWorldPosition(out);
      this.rightMiddle.getWorldPosition(this.second);
      out.add(this.second).multiplyScalar(0.5);
    } else {
      this.rightHand.getWorldPosition(out);
    }
    return out;
  }

  correctJoint(joint) {
    if (!joint) return;
    joint.getWorldPosition(this.jointPosition);
    this.readNock(this.temp);
    this.currentDirection.copy(this.temp).sub(this.jointPosition).normalize();
    this.targetDirection.copy(this.desiredNock).sub(this.jointPosition).normalize();
    this.deltaQuaternion.setFromUnitVectors(this.currentDirection, this.targetDirection);
    joint.getWorldQuaternion(this.worldQuaternion);
    this.worldQuaternion.premultiply(this.deltaQuaternion);
    joint.parent.getWorldQuaternion(this.parentQuaternion).invert();
    joint.quaternion.copy(this.parentQuaternion).multiply(this.worldQuaternion);
    joint.updateWorldMatrix(true, true);
  }

  sample(skillTime, phase) {
    if (skillTime === this.lastTime && phase === this.lastPhase) return this;
    this.lastTime = skillTime;
    this.lastPhase = phase;
    const drawProgress = smoothstep(skillTime, 0.015, 0.72);
    const beforeRelease = skillTime <= 0.75;
    const clipTime = beforeRelease
      ? 0.015 + drawProgress * 0.14
      : Math.min(0.155 + (skillTime - 0.75) * 1.15, 0.695);
    // PropertyMixer skips assigning an unchanged animation value. Restore the
    // uncorrected joints first, so repeated exact-time samples cannot accumulate IK.
    if (this.hasManualCorrection) {
      this.rightArm.quaternion.copy(this.baseArmQuaternion);
      this.rightForeArm.quaternion.copy(this.baseForeArmQuaternion);
    }
    this.actor.action.paused = false;
    this.actor.mixer.setTime(clipTime);
    this.baseArmQuaternion.copy(this.rightArm.quaternion);
    this.baseForeArmQuaternion.copy(this.rightForeArm.quaternion);
    this.hasManualCorrection = beforeRelease;
    if (!beforeRelease && this.calibrated) {
      // Fade out the contact correction over the first 90 ms of release, so
      // the hand does not jump back to the uncorrected source pose on that frame.
      const correctionWeight = 1 - smoothstep(skillTime - 0.75, 0, 0.09);
      if (correctionWeight > 0) {
        this.hasManualCorrection = true;
        this.fadeCorrectionQuaternion.slerpQuaternions(this.identityQuaternion, this.releaseArmCorrection, correctionWeight);
        this.rightArm.quaternion.premultiply(this.fadeCorrectionQuaternion);
        this.fadeCorrectionQuaternion.slerpQuaternions(this.identityQuaternion, this.releaseForeArmCorrection, correctionWeight);
        this.rightForeArm.quaternion.premultiply(this.fadeCorrectionQuaternion);
      }
    }
    this.actor.root.updateWorldMatrix(true, true);
    this.readGrip(this.grip);
    this.readNock(this.nock);

    // Lift the shaft onto a rest immediately above the left palm, keeping its
    // line directed at the target. Small arm corrections place the actual
    // hooked fingers on this line; the string and arrow use that same point.
    this.direction.copy(AIM_TARGET).sub(this.grip).normalize();
    this.quaternion.setFromUnitVectors(X_AXIS, this.direction);
    this.arrowRest.set(0, 0.055, 0.025).applyQuaternion(this.quaternion).add(this.grip);
    this.direction.copy(AIM_TARGET).sub(this.arrowRest).normalize();
    if (beforeRelease) {
      const nativeDraw = this.temp.copy(this.arrowRest).sub(this.nock).dot(this.direction);
      const drawLength = clamp(nativeDraw + 0.07 * drawProgress, 0.45, 1.1);
      this.desiredNock.copy(this.arrowRest).addScaledVector(this.direction, -drawLength);
      // Three small CCD corrections use only the two arm joints; fingers,
      // shoulders, skinning, and the animation's elbow bend remain intact.
      for (let iteration = 0; iteration < 3; iteration++) {
        this.correctJoint(this.rightForeArm);
        this.correctJoint(this.rightArm);
      }
      this.readNock(this.nock);
    }
    this.direction.copy(AIM_TARGET).sub(this.nock).normalize();
    this.quaternion.setFromUnitVectors(X_AXIS, this.direction);
    this.bow.position.copy(this.grip);
    this.bow.quaternion.copy(this.quaternion);
    if (!beforeRelease && this.calibrated) {
      this.leftHand.getWorldQuaternion(this.handQuaternion);
      this.bowFollowQuaternion.copy(this.handQuaternion).multiply(this.leftHandToBow);
      this.bow.quaternion.slerp(this.bowFollowQuaternion, smoothstep(skillTime - 0.75, 0.035, 0.3));
    }
    this.bow.updateWorldMatrix(true, true);
    return this;
  }
}
