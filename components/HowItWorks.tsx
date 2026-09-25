export function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Paste URL",
      desc: "Provide a public YouTube or Instagram Reel link that you are authorized to download.",
    },
    {
      num: "02",
      title: "Select Options",
      desc: "Choose between Video or Audio streams, container format, and quality presets.",
    },
    {
      num: "03",
      title: "Process Media",
      desc: "Media worker transcodes and prepares your requested media file.",
    },
    {
      num: "04",
      title: "Download",
      desc: "Download your processed file directly to your device.",
    },
  ];

  return (
    <section id="how-it-works" className="w-full py-12 sm:py-16 border-t border-[#DCDDD8]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-10">
        <div className="text-center space-y-2 max-w-xl mx-auto">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[#111111]">
            How Mediaflow works.
          </h2>
          <p className="text-[#6B6B67] text-sm sm:text-base">
            Simple three-step process for fast and reliable media processing.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((step) => (
            <div
              key={step.num}
              className="bg-white p-5 rounded-xl border border-[#DCDDD8] space-y-3"
            >
              <div className="font-mono text-xs font-semibold text-[#6B6B67]">
                {step.num}
              </div>
              <h3 className="font-bold text-base text-[#111111]">{step.title}</h3>
              <p className="text-xs text-[#6B6B67] leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
