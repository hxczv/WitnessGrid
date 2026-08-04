export {};

declare global {
  interface HTMLVideoElement {
    captureStream(frameRequestRate?: number): MediaStream;
  }
  interface HTMLCanvasElement {
    captureStream(frameRequestRate?: number): MediaStream;
  }
}