// The terrain piece the player is pointing at while picking a flag's scenario terrain (91 SR10): the prompt writes it, the board reads it.
import { create } from 'zustand'
import type { Id } from '../../../engine/index'

interface PickHover { id: Id | null; set(id: Id | null): void }
export const usePickHover = create<PickHover>((set) => ({ id: null, set: (id) => set({ id }) }))
export const setPickHover = (id: Id | null): void => usePickHover.getState().set(id)
