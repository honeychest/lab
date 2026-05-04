# Visual Effect Samples

공용 UI 효과 샘플 원장입니다. 다른 페이지에서 효과를 요청할 때는 sample key를 그대로 말합니다.
샘플 CSS는 색상·크기·최종 도형을 확정하지 않고, animation/effect hook만 제공합니다.
적용 대상 페이지가 `currentColor`, 크기, border/background를 정합니다.

예:
- `sample_live_spinner 를 logistics-route-node 진행중 dot에 적용`
- `sample_scan_beam 을 감시중 카드 배경에 적용`
- `sample_error_badge 를 실패 pill 앞에 적용`
- `sample_route_arrow 를 진행중 노선 화살표에 적용`

사용:
```jsx
<span className="sample_live_spinner" aria-hidden="true" />
```

샘플 목록은 `visualSamples.js`, 실제 CSS는 `visualSamples.css`에 있습니다.
