export interface Storage {
  download(path: string, localDest: string): Promise<void>;
  upload(localSource: string, path: string): Promise<void>;
  delete(path: string): Promise<void>;
}
