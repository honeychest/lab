// [AGENT] useEffect 패턴 테스트용 — 개발 학습 전용 컴포넌트(/test 경로)
import { useEffect, useState } from 'react';

  export default function EffectPatternsDemo() {
    const [count, setCount] = useState(0);
    const [text, setText] = useState('A');

    // 1) 의존성 없음: 매 렌더마다 실행
    useEffect(() => {
      console.log('[no deps] effect run', { count, text });
      return () => {
        console.log('[no deps] cleanup before next render/unmount');
      };
    });

    // 2) 빈 배열 []: 마운트 1번, 언마운트 1번(cleanup)
    useEffect(() => {
      console.log('[empty deps] mount only');
      return () => {
        console.log('[empty deps] unmount cleanup');
      };
    }, []);

    // 3) 값 배열 [count]: count 바뀔 때만 재실행
    useEffect(() => {
      console.log('[count deps] effect run, count =', count);
      return () => {
        console.log('[count deps] cleanup before count changes/unmount, old count =', count);
      };
    }, [count]);

    return (
      <div style={{ padding: 16 }}>
        <button onClick={() => setCount((c) => c + 1)}>count +1</button>
        <button onClick={() => setText((t) => (t === 'A' ? 'B' : 'A'))}>toggle text</button>
        <p>count: {count}</p>
        <p>text: {text}</p>
      </div>
    );
  }
