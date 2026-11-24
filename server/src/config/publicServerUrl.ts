export const publicServerUrl = (): string => {
  const address = process.env.SERVER_URL;
  const url = new URL(address || process.env.BASE_URL || "http://localhost");
  if (!address && !url.port && url.protocol === "http:") {
    url.port = process.env.PORT || "3001";
  }
  return url.origin;
};
