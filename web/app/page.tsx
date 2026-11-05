import { AppNav } from "@/components/AppNav";
import { HomeHero } from "@/components/HomeHero";

export default function HomePage() {
  return (
    <div className="min-h-screen pb-24 lg:pb-0 lg:pl-[288px]">
      <AppNav />
      <HomeHero />
    </div>
  );
}
