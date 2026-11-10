// ══ FEATURE: РЕЖИМ РОЗРОБНИКА (DEV MODE) ══
// Відповідальність: перегляд і верифікація даних позицій безпосередньо у UI станції.
// Активується прихованим жестом (5 тапів на футері About-шторки).
//
// Публічне API:
//   isDevMode()                          → boolean
//   toggleDevMode()                      → boolean
//   getDevLog()                          → LogEntry[]
//   appendDevLog(entry)                  → void
//   isVerified(slug, posIdx)             → boolean (= остаточно підтверджено, 100%)
//   getConfirmationData(slug, posIdx)    → {finalConfirmed, confirmCount, disputeCount, corrections, lastAction}
//   incrementConfirmCount(slug, posIdx)  → object (нові дані)
//   addDisputeVote(slug, posIdx, w, d)   → object (нові дані)
//   setFinalConfirmed(slug, posIdx)      → object (нові дані)
//   undoLastConfirmAction(slug, posIdx)  → object (відновлені дані)
//   resetConfirmationData(slug, posIdx)  → object (порожні дані)
//   getDevNote(slug, posIdx)             → string
//   setDevNote(slug, posIdx, text)       → void
//   isExitsCatalogVerified(slug)         → boolean
//   setExitsCatalogVerified(slug)        → void
//   resetExitsCatalogVerified(slug)      → void
//   getAllExitsVerified()                → object
//   attachDevModeUI(container, slug)     → void
//   showDevModeToast(active)             → void
//   updateDevModeIndicator(sheet, active)→ void
//   setupDevModeTapCounter(aboutSheet)   → void
//
// Код розкладено по src/features/devmode/: icons, sync, data, cardUI, photos.
// Цей файл лише реекспортує їхнє публічне API, тож імпорти з інших місць
// не змінюються.



export { isDevMode, toggleDevMode, getDevLog, appendDevLog } from './devFlags.js';
export {
  removeDevPhoto,
  showDevModeToast,
  updateDevModeIndicator,
  renderDevAuthSection,
  attachAboutSheet,
  updateDevMenuButtonVisibility,
} from './devmode/sync.js';
export {
  isVerified,
  getDevNote,
  setDevNote,
  getAllDevNotes,
  getAllDevVerified,
  getConfirmationData,
  getAllDevConfirmations,
  incrementConfirmCount,
  addDisputeVote,
  setFinalConfirmed,
  undoLastConfirmAction,
  resetConfirmationData,
  getDevBacklog,
  setDevBacklog,
  getStationNote,
  getAllStationNotes,
  setStationNote,
  getExitsCatalogStatus,
  getExitsCatalogCount,
  cycleExitsCatalogStatus,
  isExitsCatalogVerified,
  setExitsCatalogPartial,
  setExitsCatalogVerified,
  resetExitsCatalogVerified,
  getAllExitsVerified,
} from './devmode/data.js';
export {
  setupDevStationNoteButton,
  attachDevModeUI,
  closeAllDevPanels,
} from './devmode/cardUI.js';


