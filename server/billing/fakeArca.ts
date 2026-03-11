export function generateFakeCAE(): { cae: string; vencimiento: Date } {
  const cae = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join("");
  const vencimiento = new Date();
  vencimiento.setDate(vencimiento.getDate() + 10);
  return { cae, vencimiento };
}
