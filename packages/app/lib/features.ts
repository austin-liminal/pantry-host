export const FEATURES = {
  imageProcessing: process.env.ENABLE_IMAGE_PROCESSING !== 'false',
} as const;
