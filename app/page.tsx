import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { DownloaderContainer } from "@/components/DownloaderContainer";
import { HowItWorks } from "@/components/HowItWorks";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col justify-between">
      <div>
        <Header />
        <main>
          <Hero>
            <DownloaderContainer />
          </Hero>
          <HowItWorks />
        </main>
      </div>
      <Footer />
    </div>
  );
}
