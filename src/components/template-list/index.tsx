export default function EnvelopeIntro({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ backgroundColor: "#f5e8dd" }}
    >
      <span>Undangan</span>
      <span>Walimatulurus</span>

      <img src="/Text-Logo/Maya&Asyraaf_Blk.png" className="h-20" />

      <span>Press to open</span>

      <img src="/Envelope/head.png" className="absolute top-0" />

      <img
        src="/Envelope/seal.png"
        className="cursor-pointer"
        onClick={onOpen}
      />

      <img src="/Envelope/body.png" className="absolute bottom-0" />
    </div>
  );
}