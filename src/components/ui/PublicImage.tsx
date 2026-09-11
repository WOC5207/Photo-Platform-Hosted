import type { ImgHTMLAttributes } from "react";

/** Defaults for public renditions that were already optimized at upload time. */
export default function PublicImage({
  priority = false,
  loading,
  decoding = "async",
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      {...props}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding={decoding}
      fetchPriority={priority ? "high" : props.fetchPriority}
    />
  );
}
