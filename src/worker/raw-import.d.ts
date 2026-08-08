/**
 * Vite'ın `?raw` yüklemesi için tip bildirimi.
 *
 * Testler kaynaktan alınmış gerçek HTML örneklerini dosyadan okur
 * (`tests/fixtures/`). Worker tsconfig'inde DOM/Vite tipleri yok, bu yüzden
 * bildirim burada duruyor.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
