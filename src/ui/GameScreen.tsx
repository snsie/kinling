// Main play screen: habitat + needs + care on one side, tabbed panels on the other.
import { useCallback, useEffect, useRef, useState } from 'react';
import { aiGreeting, finishAdventure, greetOnArrival } from '../app/actions';
import { useAiStatus } from '../app/aiControl';
import { store } from '../app/store';
import { ui, useUi, type TabId } from '../app/ui';
import { isFirstVisit, routeAvailability } from '../game/adventure';
import type { RewardSummary } from '../game/outcome';
import { canWriteDiary } from '../game/social';
import { lifeStageFor } from '../game/stage';
import type { RouteId, SaveData } from '../game/types';
import type { MinigameResult, RunConfig } from '../minigame/engine';
import { CareBar } from './CareBar';
import { Tabs, TabPanel, type TabDef } from './common';
import { Icon } from './icons';
import { Minigame } from './Minigame';
import { NeedsPanel } from './Needs';
import { AdventureResults, ExplorePanel } from './panels/ExplorePanel';
import { BagPanel } from './panels/BagPanel';
import { DiaryPanel } from './panels/DiaryPanel';
import { EvolvePanel } from './panels/EvolvePanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { TalkPanel } from './panels/TalkPanel';
import { Stage } from './Stage';

type Adventure = { phase: 'play'; config: RunConfig } | { phase: 'results'; rewards: RewardSummary; route: RouteId; line?: string };

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]!;
}

export function GameScreen({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const { tab } = useUi();
  const aiStatus = useAiStatus();
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const greeted = useRef(false);
  const aiGreeted = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const shownTab = useRef(tab);
  const c = save.creature!;

  // Switching tabs from deep inside a long panel (the tab bar is sticky) brings
  // the new panel's top back into view instead of leaving you mid-page.
  useEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    const el = panelRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
  }, [tab]);

  useEffect(() => {
    if (!greeted.current) {
      greeted.current = true;
      greetOnArrival();
    }
    const tick = () => {
      const fb = store.tick();
      if (fb) greetOnArrival();
    };
    const id = setInterval(tick, 10_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
      else void store.flush();
    };
    const onHide = () => void store.flush();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  // Once the model finishes loading mid-session, let the creature say hello in its own voice.
  useEffect(() => {
    if (aiStatus.kind === 'ready' && !aiGreeted.current && !adventure) {
      aiGreeted.current = true;
      setTimeout(aiGreeting, 600);
    }
  }, [aiStatus.kind, adventure]);

  const startAdventure = useCallback((route: RouteId) => {
    const s = store.save;
    if (!s?.creature) return;
    const avail = routeAvailability(s, route);
    if (!avail.available) {
      ui.toast(avail.reason ?? 'Not available right now.', 'warn');
      return;
    }
    setAdventure({
      phase: 'play',
      config: { route, seed: randomSeed(), relaxed: s.settings.relaxedMinigame, firstVisit: isFirstVisit(s, route), canSwim: s.creature.appearance.tail === 'paddle' && route === 'pond-deep' },
    });
  }, []);

  const onFinish = useCallback((result: MinigameResult) => {
    const out = finishAdventure(result);
    if (out?.rewards) setAdventure({ phase: 'results', rewards: out.rewards, route: result.route, line: out.feedback.line });
    else setAdventure(null);
  }, []);

  const adoptable = save.unlocks.traits.some((t) => !save.unlocks.owned.includes(t) && !t.startsWith('shape.'));
  const tabs: TabDef<TabId>[] = [
    { id: 'talk', label: 'Talk', icon: Icon.talk() },
    { id: 'explore', label: 'Explore', icon: Icon.explore() },
    { id: 'bag', label: 'Bag', icon: Icon.bag() },
    { id: 'evolve', label: 'Evolve', icon: Icon.evolve(), badge: adoptable },
    { id: 'diary', label: 'Diary', icon: Icon.diary(), badge: canWriteDiary(save) },
    { id: 'settings', label: 'Settings', icon: Icon.settings() },
  ];

  if (adventure?.phase === 'play') {
    return (
      <main className="adventure" id="main">
        <Minigame config={adventure.config} appearance={c.appearance} stage={lifeStageFor(c.bond)} name={c.name} reducedMotion={reducedMotion} onFinish={onFinish} />
      </main>
    );
  }
  if (adventure?.phase === 'results') {
    const again = routeAvailability(save, adventure.route).available;
    return (
      <main className="adventure" id="main">
        <AdventureResults
          rewards={adventure.rewards}
          route={adventure.route}
          line={adventure.line}
          canAgain={again}
          onAgain={() => startAdventure(adventure.route)}
          onHome={() => {
            setAdventure(null);
            ui.setTab('talk');
          }}
        />
      </main>
    );
  }

  return (
    <main className="layout" id="main">
      <section className="layout__home" aria-label="Home">
        <Stage save={save} reducedMotion={reducedMotion} />
        <NeedsPanel needs={c.needs} />
        <CareBar save={save} />
      </section>
      <section className="layout__panel card" ref={panelRef}>
        <Tabs tabs={tabs} active={tab} onChange={ui.setTab} label="Activities" idPrefix="main" />
        <TabPanel idPrefix="main" id="talk" active={tab === 'talk'}>
          <TalkPanel save={save} onExplore={startAdventure} />
        </TabPanel>
        <TabPanel idPrefix="main" id="explore" active={tab === 'explore'}>
          <ExplorePanel save={save} onStart={startAdventure} />
        </TabPanel>
        <TabPanel idPrefix="main" id="bag" active={tab === 'bag'}>
          <BagPanel save={save} />
        </TabPanel>
        <TabPanel idPrefix="main" id="evolve" active={tab === 'evolve'}>
          <EvolvePanel save={save} reducedMotion={reducedMotion} />
        </TabPanel>
        <TabPanel idPrefix="main" id="diary" active={tab === 'diary'}>
          <DiaryPanel save={save} />
        </TabPanel>
        <TabPanel idPrefix="main" id="settings" active={tab === 'settings'}>
          <SettingsPanel save={save} />
        </TabPanel>
      </section>
    </main>
  );
}
