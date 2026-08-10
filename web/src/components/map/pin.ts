// The amber location pin used on every map, as a data-URI so it can be set
// as a marker background image without shipping an extra asset request.
export function pinSvgDataUri(
  width = 26,
  height = 38,
  color = "#E8A33D",
  stroke = "#12151C",
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${width}" height="${height}" fill="none"><path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" fill="${color}" stroke="${stroke}" stroke-width="1.5"/><circle cx="12" cy="10" r="3" fill="${stroke}"/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
