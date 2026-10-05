// Public surface of the board agent: mount <Battlefield /> and use the interaction helpers from the UI.
export { Battlefield, ModelProxies } from './Board'
export { interactionActions, useInteractionStore } from '../interaction/store'
export {
  activationOption, autoPlace, cancelStaged, commitStaged, optionsTargeting, pickTargetOption, placementIds, weaponChoices,
} from '../interaction/controller'
export type { CameraPresetId } from './layout'
