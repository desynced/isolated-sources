declare module "tesseract.js/dist/tesseract.esm.min.js" {
  interface OcrWorker {
    recognize(image: Blob): Promise<{ data: { text: string } }>;
    terminate(): Promise<unknown>;
  }
  interface TesseractModule {
    createWorker(
      langs: string,
      oem: number,
      options: {
        workerPath: string;
        corePath: string;
        langPath: string;
        gzip: boolean;
        workerBlobURL: boolean;
        cacheMethod: string;
      },
    ): Promise<OcrWorker>;
  }
  const tesseract: TesseractModule;
  export default tesseract;
}
