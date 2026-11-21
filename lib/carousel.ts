/**
 * The frame ratio (width / height) a carousel gives an image: the image's own ratio, held between a very tall
 * (9:16) and a very wide (1.91:1) limit so a panorama or a long screenshot cannot make the post absurdly flat or
 * tall. The image itself is never cropped: inside the frame it is shown whole (object-contain).
 */
export const CAROUSEL_MIN_RATIO = 9 / 16;
export const CAROUSEL_MAX_RATIO = 1.91;

export function carouselRatio(width: number, height: number) {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.min(CAROUSEL_MAX_RATIO, Math.max(CAROUSEL_MIN_RATIO, width / height));
}
