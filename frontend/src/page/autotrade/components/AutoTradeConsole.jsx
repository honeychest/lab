import styles from './AutoTradeConsole.module.css';
import {
    EXECUTION_FIELDS,
    EXECUTION_OPERATION_FIELDS,
    EXECUTION_MODE_OPTIONS,
    STRATEGY_FIELDS,
    formatNumber,
    firstPosition,
    modeLabel,
    reconciliationLabel,
    routeLabel,
} from '../model/autoTradeDisplay.js';

function Card({ children, className = '' }) {
    return <section className={`${styles.card} ${className}`}>{children}</section>;
}

function CardHeading({ eyebrow, title, action }) {
    return (
        <div className={styles.cardHeading}>
            <div>
                <div className={styles.cardEyebrow}>{eyebrow}</div>
                <h2 className={styles.cardTitle}>{title}</h2>
            </div>
            {action}
        </div>
    );
}

function StatusDot({ tone = 'neutral' }) {
    return <span className={`${styles.statusDot} ${styles[tone]}`} aria-hidden="true" />;
}

function Metric({ label, value, detail, tone = 'neutral' }) {
    return (
        <div className={styles.metric}>
            <div className={styles.metricLabel}>{label}</div>
            <div className={`${styles.metricValue} ${styles[tone]}`}>{value}</div>
            {detail && <div className={styles.metricDetail}>{detail}</div>}
        </div>
    );
}

function Field({ definition, value, onChange, onSymbolChange, symbolOptions = [], disabled = false }) {
    const inputId = `autotrade-${definition.key}`;
    const singleOption = definition.kind === 'select' && definition.options.length === 1;
    const symbolField = definition.kind === 'symbol';
    const symbolOptionsAvailable = symbolField && symbolOptions.length > 0;
    return (
        <label className={styles.field} htmlFor={inputId}>
            <span className={styles.fieldLabel}>{definition.label}</span>
            <span className={styles.fieldControl}>
                {singleOption || (symbolField && !symbolOptionsAvailable) ? (
                    <span id={inputId} className={styles.readonlyValue}>
                        {symbolField ? (value || '심볼 확인 중') : definition.options[0].label}
                    </span>
                ) : symbolOptionsAvailable || definition.kind === 'select' ? (
                    <select
                        id={inputId}
                        className={styles.input}
                        value={value || ''}
                        disabled={disabled}
                        onChange={(event) => {
                            if (symbolField && onSymbolChange) {
                                onSymbolChange(event.target.value);
                                return;
                            }
                            onChange(definition.key, event.target.value);
                        }}
                    >
                        {(symbolField
                            ? symbolOptions.map((symbol) => ({ value: symbol, label: symbol }))
                            : definition.options).map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                ) : (
                    <input
                        id={inputId}
                        className={`${styles.input} ${definition.suffix ? styles.inputWithSuffix : ''}`}
                        type={definition.kind === 'number' || definition.kind === 'percent' ? 'number' : 'text'}
                        step={definition.step}
                        min={definition.min}
                        value={value || ''}
                        onChange={(event) => onChange(definition.key, event.target.value)}
                    />
                )}
                {definition.suffix && <span className={styles.fieldSuffix}>{definition.suffix}</span>}
            </span>
        </label>
    );
}

function ModePicker({ value, activeValue, onChange }) {
    return (
        <div className={styles.modePicker} role="group" aria-label="자동매매 실행 모드">
            {EXECUTION_MODE_OPTIONS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    className={`${styles.modeButton} ${value === option.value ? styles.modeButtonActive : ''} ${activeValue === option.value ? styles.modeButtonApplied : ''} ${option.value === 'LIVE' ? styles.modeButtonLive : ''}`}
                    onClick={() => onChange(option.value)}
                    aria-pressed={value === option.value}
                >
                    <span>{option.label}</span>
                    <small>{option.value}</small>
                    {value === option.value && activeValue !== option.value && <em>저장 전</em>}
                    {activeValue === option.value && <em>적용 중</em>}
                </button>
            ))}
        </div>
    );
}

export default function AutoTradeConsole({
    config,
    execution,
    status,
    reconciliation,
    symbolOptions,
    draftConfig,
    draftExecution,
    symbolApplying,
    loading,
    error,
    notice,
    dangerAction,
    isDetached,
    floatingSupported,
    onConfigChange,
    onSymbolChange,
    onExecutionChange,
    onSaveConfig,
    onSaveExecution,
    onRunOnce,
    onResetUnknown,
    onConfirmDanger,
    onCancelDanger,
    onRefresh,
    onToggleAlwaysOnTop,
}) {
    const position = firstPosition(reconciliation);
    const lastResult = status?.lastResult;
    const activeExecution = status || execution || {};
    const activeMode = activeExecution.mode;
    const isLive = activeMode === 'LIVE';
    const latestPriceIsCurrent = Boolean(config?.symbol)
        && status?.latestPriceSymbol === config.symbol;
    const hasPendingExecutionChange = draftExecution?.mode !== activeExecution.mode
        || draftExecution?.policy !== activeExecution.policy;
    const accountKnown = ['FLAT', 'OPEN_POSITION', 'PENDING_ORDERS'].includes(reconciliation?.kind);
    const runLabel = isLive ? '실거래 1회 실행' : '1회 실행';

    return (
        <div className={styles.console}>
            <header className={styles.hero}>
                <div>
                    <div className={styles.kicker}>AUTOTRADE / CONTROL ROOM</div>
                    <h1 className={styles.title}>자동매매 관제</h1>
                    <p className={styles.subtitle}>전략 설정과 실행 상태를 한 화면에서 확인합니다.</p>
                </div>
                <div className={styles.heroActions}>
                    <label className={styles.topToggle}>
                        <input
                            type="checkbox"
                            checked={Boolean(isDetached)}
                            onChange={(event) => onToggleAlwaysOnTop(event.target.checked)}
                        />
                        <span>항상 위로 분리</span>
                    </label>
                    <button type="button" className={styles.secondaryButton} onClick={onRefresh} disabled={loading}>
                        {loading ? '갱신 중' : '새로고침'}
                    </button>
                </div>
            </header>

            {error && <div className={`${styles.banner} ${styles.bannerError}`} role="alert">{error}</div>}
            {notice && <div className={`${styles.banner} ${styles.bannerSuccess}`} role="status">{notice}</div>}
            {!floatingSupported && !isDetached && (
                <div className={`${styles.banner} ${styles.bannerInfo}`}>
                    현재 브라우저는 항상 위 분리를 지원하지 않아 일반 팝업으로 엽니다.
                </div>
            )}

            {dangerAction && (
                <div className={`${styles.banner} ${styles.bannerWarning}`} role="alert">
                    <div>
                        <strong>{dangerAction === 'run' ? '실거래 주문을 실행하려고 합니다.' : '실거래 모드로 변경하려고 합니다.'}</strong>
                        <span> 서버에서 LIVE 허용 설정이 있어야 실제 주문이 제출됩니다.</span>
                    </div>
                    <div className={styles.bannerActions}>
                        <button type="button" className={styles.dangerButton} onClick={onConfirmDanger}>계속</button>
                        <button type="button" className={styles.secondaryButton} onClick={onCancelDanger}>취소</button>
                    </div>
                </div>
            )}

            <div className={styles.statusStrip}>
                <Metric label="실행 모드" value={modeLabel(status?.mode || execution?.mode)} tone={isLive ? 'critical' : 'primary'} />
                <Metric label="실행 주체" value={routeLabel(status?.route)} detail={status?.leader || '리더 확인 중'} />
                <Metric
                    label="마지막 체결가"
                    value={latestPriceIsCurrent ? formatNumber(status?.latestPrice, 6) : '-'}
                    detail={symbolApplying || !latestPriceIsCurrent ? '새 심볼 가격 수신 대기' : (config?.symbol || '심볼 확인 중')}
                />
                <Metric label="대조 상태" value={reconciliationLabel(reconciliation?.kind)} tone={reconciliation?.kind === 'UNKNOWN' ? 'warn' : 'success'} />
            </div>

            <div className={styles.contentGrid}>
                <main className={styles.mainColumn}>
                    <Card>
                        <CardHeading eyebrow="OBSERVE / SOURCE OF TRUTH" title="현황" />
                        {position ? (
                            <div className={styles.positionGrid}>
                                <Metric label="방향" value={position.side || '-'} tone={position.side === 'LONG' ? 'success' : 'critical'} />
                                <Metric label="수량" value={formatNumber(position.quantity, 6)} />
                                <Metric label="평균 진입가" value={formatNumber(position.entryPrice, 6)} />
                                <Metric label="미실현 손익" value={formatNumber(position.unrealizedProfit, 4)} />
                            </div>
                        ) : accountKnown ? (
                            <div className={styles.emptyState}>
                                <StatusDot tone="success" />
                                <div>
                                    <strong>현재 포지션 없음</strong>
                                    <span>대조 결과를 기준으로 다음 진입을 기다립니다.</span>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.emptyState}>
                                <StatusDot tone="warn" />
                                <div>
                                    <strong>포지션 확인 불가</strong>
                                    <span>바이낸스 계정 대조가 완료되지 않았습니다.</span>
                                </div>
                            </div>
                        )}
                        <div className={styles.accountSummary}>
                            <Metric label="지갑 잔고" value={accountKnown ? `${formatNumber(reconciliation?.account?.totalWalletBalance, 4)} USDT` : '대조 불가'} />
                            <Metric label="사용 가능 잔고" value={accountKnown ? `${formatNumber(reconciliation?.account?.availableBalance, 4)} USDT` : '대조 불가'} />
                            <Metric label="미체결 일반 주문" value={accountKnown ? `${reconciliation?.account?.openOrders?.length || 0}건` : '대조 불가'} />
                        </div>
                        <div className={styles.observationLower}>
                            <div className={styles.detailList}>
                                <div><span>실행 라우트</span><strong>{routeLabel(status?.route)}</strong></div>
                                <div><span>리더</span><strong>{status?.leader || '-'}</strong></div>
                                <div><span>대조 메시지</span><strong>{reconciliation?.message || '-'}</strong></div>
                            </div>
                            <div className={styles.lastAction}>
                                <div className={styles.lastActionKind}>{lastResult?.action || 'NO_ACTION'}</div>
                                <p>{lastResult?.message || '아직 실행 결과가 없습니다.'}</p>
                                {lastResult?.submission && <span>{lastResult.submission.kind || '결과 확인 중'}</span>}
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <CardHeading
                            eyebrow="STRATEGY / LIVE CONFIG"
                            title="전략 설정"
                            action={<button type="button" className={styles.primaryButton} onClick={onSaveConfig}>설정 저장</button>}
                        />
                        <div className={styles.formGrid}>
                            {STRATEGY_FIELDS.map((definition) => (
                                <Field
                                    key={definition.key}
                                    definition={definition}
                                    value={draftConfig?.[definition.key]}
                                    onChange={onConfigChange}
                                    onSymbolChange={onSymbolChange}
                                    symbolOptions={symbolOptions}
                                    disabled={definition.kind === 'symbol' && symbolApplying}
                                />
                            ))}
                        </div>
                        <p className={styles.helper}>심볼은 선택 즉시 적용됩니다. 나머지 전략 값은 설정 저장 후 다음 실행부터 적용되며, 활성 포지션의 평균가 기준 판단에도 반영됩니다.</p>
                    </Card>

                </main>

                <aside className={styles.sideColumn}>
                    <Card className={styles.actionCard}>
                        <CardHeading eyebrow="OPERATE / SAFETY GATE" title="조작" />
                        <ModePicker value={draftExecution?.mode} activeValue={activeMode} onChange={(value) => onExecutionChange('mode', value)} />
                        <div className={styles.operationFields}>
                            {EXECUTION_OPERATION_FIELDS.map((definition) => (
                                <Field
                                    key={definition.key}
                                    definition={definition}
                                    value={draftExecution?.[definition.key]}
                                    onChange={onExecutionChange}
                                />
                            ))}
                        </div>
                        {hasPendingExecutionChange && <div className={styles.pendingNotice}>저장 전 변경이 있습니다.</div>}
                        <div className={styles.buttonStack}>
                            <button type="button" className={styles.primaryButtonWide} onClick={onSaveExecution}>실행 설정 저장</button>
                            <button type="button" className={isLive ? styles.dangerButton : styles.secondaryButtonWide} onClick={onRunOnce}>
                                {runLabel}
                            </button>
                            {status?.unknownOrderBlocked && (
                                <button type="button" className={styles.warningButton} onClick={onResetUnknown}>
                                    확인 불가 주문 차단 해제
                                </button>
                            )}
                        </div>
                        <p className={styles.helper}>실행 주체가 아닌 서버에서 요청해도 설정된 실행 서버로 전달됩니다.</p>
                        <div className={styles.operatorHealth}>
                            <div><span>실행 루프</span><strong>{status?.running ? '실행 중' : '대기'}</strong></div>
                            <div><span>결과 차단</span><strong className={status?.unknownOrderBlocked ? styles.critical : styles.success}>{status?.unknownOrderBlocked ? '확인 필요' : '정상'}</strong></div>
                        </div>
                        <details className={styles.advancedSettings}>
                            <summary className={styles.advancedSummary}>
                                <span>고급 실행 간격</span>
                                <small>필요할 때만 수정</small>
                            </summary>
                            <div className={styles.formGrid}>
                                {EXECUTION_FIELDS.map((definition) => (
                                    <Field
                                        key={definition.key}
                                        definition={definition}
                                        value={draftExecution?.[definition.key]}
                                        onChange={onExecutionChange}
                                    />
                                ))}
                            </div>
                        </details>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
