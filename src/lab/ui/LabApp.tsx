import { useEffect } from 'react';
import { lab, useLab } from '../store';
import { ConversationPanel } from './ConversationPanel';
import { Inspector } from './Inspector';
import { SetupPanel } from './SetupPanel';

export function LabApp() {
  const state = useLab();
  useEffect(() => {
    void lab.init();
  }, []);
  return (
    <div className="lab">
      <aside className="col" aria-label="Setup">
        <SetupPanel state={state} />
      </aside>
      <main className="col col-mid" aria-label="Conversation">
        <ConversationPanel state={state} />
      </main>
      <aside className="col" aria-label="Inspector">
        <Inspector state={state} />
      </aside>
    </div>
  );
}
