export function statusOk(status: number): boolean {
  return status >= 200 && status < 300;
}
