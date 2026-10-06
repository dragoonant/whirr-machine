// Which battlefield the current game is on (client-only; the engine never sees it) plus the loaded boards.json.
import { create } from 'zustand'
import type { Id } from '../../engine/index'
import { BOARDS, DEFAULT_BOARD, boardFor, mergeBoardsJson, type BoardDef } from './boards'

export interface BoardStoreState { boardId: Id; boards: readonly BoardDef[] }

export const useBoardStore = create<BoardStoreState>(() => ({ boardId: DEFAULT_BOARD.id, boards: BOARDS }))

export const setBoardId = (id: Id): void => { if (boardFor(id) && useBoardStore.getState().boardId !== boardFor(id)!.id) useBoardStore.setState({ boardId: boardFor(id)!.id }) }
export const getBoardId = (): Id => useBoardStore.getState().boardId

const resolve = (s: BoardStoreState): BoardDef => s.boards.find((b) => b.id === s.boardId) ?? DEFAULT_BOARD
/** The current board definition (stable reference until boards.json lands or the board changes). */
export const useBoard = (): BoardDef => useBoardStore(resolve)
export const getBoard = (): BoardDef => resolve(useBoardStore.getState())

let requested = false
/** Fetch the optional boards.json once; any failure (missing file, a SPA fallback page, bad JSON) keeps the built-ins. */
export function loadBoardsJson(): void {
  if (requested || typeof fetch === 'undefined') return
  requested = true
  fetch(`${import.meta.env.BASE_URL}assets/terrain/boards/boards.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) useBoardStore.setState({ boards: mergeBoardsJson(j) }) })
    .catch(() => { /* built-in defaults stay */ })
}
