const verificationHolds = new Set<symbol>();

export function holdSessionWrites(owner: symbol, blocked: boolean) {
  if (blocked) verificationHolds.add(owner);
  else verificationHolds.delete(owner);
}

export function assertSessionWriteAllowed(method: string) {
  if (verificationHolds.size && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    throw Object.assign(new Error("Estamos verificando la conexión y tu sesión. La solicitud no se envió; reintentá cuando termine la verificación."),
      { code: "SESSION_VERIFICATION_PENDING", notSent: true });
  }
}
