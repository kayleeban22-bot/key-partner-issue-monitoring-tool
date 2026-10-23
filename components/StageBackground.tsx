"use client";

// 디자인: 첫 화면 뒤에서 돌아가는 영상. 영상의 마지막 장면과 첫 장면이 이어지지 않아서, 같은 영상 두 개를
// 번갈아 켜며 반복 지점에서 서서히 겹쳐 보이게 한다(끊김 숨기기). 영상은 장식이라 불러오지 못하면 검정 바탕만 보인다.
// 움직임 줄이기 설정(prefers-reduced-motion)이면 첫 장면에 멈춰 둔다.
import { useEffect, useRef } from "react";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104036_bd6924f6-3c8e-417e-8465-6d03c8c2e9e6.mp4";
const POSTER_URL =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/82e7eb75-c65f-490a-99b5-f3d1cad54200.webp";
const FADE = 0.9; // 초

export default function StageBackground() {
  const aRef = useRef<HTMLVideoElement>(null);
  const bRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;

    const play = (video: HTMLVideoElement) => {
      video.play().catch(() => {});
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      a.removeAttribute("autoplay");
      a.pause();
      b.pause();
      try {
        a.currentTime = 0;
      } catch {
        // 아직 준비되지 않았으면 그대로 둔다.
      }
      return;
    }

    let current = a;
    let next = b;
    let swapping = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (swapping || !current.duration) return;
      if (current.duration - current.currentTime > FADE) return;
      swapping = true;
      const out = current;
      next.currentTime = 0;
      play(next);
      next.classList.add("is-active");
      out.classList.remove("is-active");
      current = next;
      next = out;
      timer = setTimeout(() => {
        out.pause();
        out.currentTime = 0;
        swapping = false;
      }, FADE * 1000 + 100);
    };

    a.addEventListener("timeupdate", tick);
    b.addEventListener("timeupdate", tick);
    play(a);
    return () => {
      a.removeEventListener("timeupdate", tick);
      b.removeEventListener("timeupdate", tick);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="bg" aria-hidden>
      <video ref={aRef} className="bg-video is-active" autoPlay muted loop playsInline preload="auto" poster={POSTER_URL} disablePictureInPicture>
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
      <video ref={bRef} className="bg-video" muted loop playsInline preload="auto" poster={POSTER_URL} disablePictureInPicture>
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
    </div>
  );
}
