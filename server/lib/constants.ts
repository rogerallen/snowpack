export const DATA_CONFIG = {
  SAMPLING_INTERVAL_DAYS: Number(process.env.SAMPLING_INTERVAL_DAYS) || 3,
  ZERO_DETECTION_THRESHOLD_DAYS:
    Number(process.env.ZERO_DETECTION_THRESHOLD_DAYS) || 14,
  ZERO_PROTECTION_START: process.env.ZERO_PROTECTION_START || '10-01', // Oct 1st
  ZERO_PROTECTION_END: process.env.ZERO_PROTECTION_END || '05-31', // May 31st
  AGGREGATION_METHOD: 'mean',
  DB_VERSION: 4,
  MIN_SNOTEL_YEAR: 1980,
};

// NRCS Report Generator URL Template
// Example: https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customSingleStationReport/daily/302:OR:SNTL%7Cid%3D%22%22%7Cname/POR_BEGIN%2CPOR_END/WTEQ%3A%3Avalue%2CSNWD%3A%3Avalue%2CTAVG%3A%3Avalue
export const NRCS_CSV_URL_TEMPLATE =
  'https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customSingleStationReport/daily/${stationId}%7Cid%3D%22%22%7Cname/POR_BEGIN%2CPOR_END/WTEQ%3A%3Avalue%2CSNWD%3A%3Avalue%2CTAVG%3A%3Avalue';
