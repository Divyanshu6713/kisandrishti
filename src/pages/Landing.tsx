import { useNavigate } from 'react-router';
import { DEMO_FARM_ID } from '@/services';
import { useFarmStore } from '@/state/farmStore';
import { useTourStore } from '@/state/tourStore';
import { Hero } from '@/features/landing/Hero';
import { Journey } from '@/features/landing/Journey';
import { LandingHeader } from '@/features/landing/LandingHeader';
import { Capabilities, FinalCta, IntelligenceSection, OrganicSection } from '@/features/landing/Sections';

export default function Landing() {
  const navigate = useNavigate();
  const enterDemo = () => {
    useFarmStore.getState().selectFarm(DEMO_FARM_ID);
    useTourStore.getState().start();
    navigate('/app');
  };
  return (
    <div className="grain">
      <a href="#journey" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-ctl focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <LandingHeader onEnter={enterDemo} />
      <main>
        <Hero onEnter={enterDemo} />
        <Journey />
        <Capabilities />
        <OrganicSection />
        <IntelligenceSection />
        <FinalCta onEnter={enterDemo} />
      </main>
    </div>
  );
}
