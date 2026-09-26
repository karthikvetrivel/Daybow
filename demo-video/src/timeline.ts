import { s } from "./anim";

/** Every beat of the video, in frames at 60 fps. */
export const T = (() => {
  const typeStart = s(8.65);
  const title = "Dinner with Sam";
  const perChar = s(1 / 13); // about 13 characters a second
  const typeEnd = typeStart + title.length * perChar;
  const predictAt = typeEnd + s(0.3); // 120 ms pause + one ~180 ms Jev call
  const saveClick = predictAt + s(0.55);
  return {
    title,
    perChar,
    cardIn: s(1.55),
    introOut: s(1.9),
    beforeCap: [s(2.55), s(4.35)] as const,
    waveStart: s(4.45),
    waveStep: 4,
    waveDur: 14,
    legendIn: s(5.3),
    waveCap: [s(4.45), s(7.05)] as const,
    zoomIn: [s(7.1), s(0.95)] as const,
    cursorShow: s(7.3),
    slotArrive: s(8.1),
    slotClick: s(8.2),
    dialogIn: s(8.24),
    typeStart,
    typeEnd,
    predictAt,
    saveMoveStart: predictAt + s(0.02),
    saveClick,
    saved: saveClick + 2,
    typeCap: [s(7.3), saveClick] as const,
    savedCap: [saveClick + 2, s(13.95)] as const,
    toastSaving: [saveClick + s(0.12), saveClick + s(1.95)] as const, // Google's own save takes about two seconds
    toastSaved: [saveClick + s(1.95), saveClick + s(3.25)] as const,
    zoomOut: [s(13.95), s(0.8)] as const,
    optionsIn: [s(14.55), s(0.6)] as const,
    // The categories editor: click a Social event, then pick Bubblegum. The color saves at once.
    chipArrive: s(15.2),
    chipClick: s(15.3),
    popIn: [s(15.33), s(0.24)] as const,
    swatchArrive: s(15.85),
    swatchClick: s(15.95),
    swatchMorph: [s(16.0), s(0.35)] as const,
    snack: [s(16.15), s(17.2)] as const,
    optionsOut: [s(17.35), s(0.5)] as const,
    remapStart: s(17.8),
    remapStep: 6,
    cursorHide: s(17.9),
    recolorCap: [s(14.55), s(19.5)] as const,
    outroIn: s(19.6),
    total: s(23.4),
  };
})();
