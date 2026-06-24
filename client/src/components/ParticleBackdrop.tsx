import { useEffect, useRef } from "react";

export default function ParticleBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    if (navigator.userAgent.includes("jsdom")) {
      return undefined;
    }

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext("2d");
    } catch {
      context = null;
    }
    if (!context) {
      return undefined;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let animation = 0;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(canvas.clientWidth * ratio);
      canvas.height = Math.floor(canvas.clientHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "rgba(90, 132, 116, 0.16)";
      for (let index = 0; index < 34; index += 1) {
        const x = (index * 47 + frame * 0.18) % Math.max(width, 1);
        const y = (index * 29 + Math.sin(frame / 38 + index) * 8) % Math.max(height, 1);
        context.beginPath();
        context.arc(x, y, index % 5 === 0 ? 1.8 : 1.1, 0, Math.PI * 2);
        context.fill();
      }

      if (!reducedMotion) {
        frame += 1;
        animation = window.requestAnimationFrame(draw);
      }
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animation);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-backdrop" aria-hidden="true" />;
}
