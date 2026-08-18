export function connectorConfig() {
  const accessToken = process.env.GHL_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "GHL_ACCESS_TOKEN must be supplied by the hosting provider's secret store",
    );
  }
  return {
    accessToken,
    companyId: process.env.GHL_COMPANY_ID,
    locationId: process.env.GHL_LOCATION_ID,
    baseUrl: process.env.GHL_BASE_URL,
  };
}
