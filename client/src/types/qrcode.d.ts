declare module 'qrcode' {
  interface QrOptions {
    width?: number;
    margin?: number;
    color?: { dark?: string; light?: string };
  }

  const QRCode: {
    toDataURL(value: string, options?: QrOptions): Promise<string>;
  };

  export default QRCode;
}
