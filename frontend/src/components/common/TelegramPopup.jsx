import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import { sendTelegramInquiry } from '../../features/support/api/contactApi';

const MAX_LENGTH   = 300;
const TARGET_BYTES = 8 * 1024 * 1024;
const QUALITIES    = [0.9, 0.7, 0.5, 0.3];

// 각 단계는 조건에 따라 선택적으로 표시됨
const ALL_STEPS = [
    { label: 'XSS 처리',      check: ()           => true },
    { label: 'Safe Browsing', check: (t)          => /https?:\/\/\S+/.test(t) },
    { label: 'VirusTotal',    check: (t, hasFile) => hasFile },
];

const compressImage = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);

        const tryQuality = (idx) => {
            if (idx >= QUALITIES.length) {
                canvas.toBlob(
                    (blob) => blob ? resolve(blob) : reject(new Error('압축 실패')),
                    'image/jpeg', QUALITIES[QUALITIES.length - 1]
                );
                return;
            }
            canvas.toBlob((blob) => {
                if (!blob) { reject(new Error('압축 실패')); return; }
                blob.size <= TARGET_BYTES ? resolve(blob) : tryQuality(idx + 1);
            }, 'image/jpeg', QUALITIES[idx]);
        };
        tryQuality(0);
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('이미지 로드 실패')); };
    img.src = objectUrl;
});

// crypto.randomUUID()는 HTTPS(보안 컨텍스트)에서만 동작 → HTTP 환경 폴백 포함
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
};

const formatDate = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

const TelegramPopup = ({ isOpen, onClose, inquiry = null, onSent }) => {
    const [text, setText]       = useState('');
    const [status, setStatus]   = useState('idle');
    const [file, setFile]       = useState(null);
    const [preview, setPreview] = useState(null);
    const [view, setView]       = useState('form'); // 'form' | 'history'
    const fileInputRef          = useRef(null);

    const [checkStep, setCheckStep]     = useState(0);
    const [activeSteps, setActiveSteps] = useState([]);

    const remaining   = MAX_LENGTH - text.length;
    const isOverLimit = remaining < 0;
    const isBusy      = status === 'compressing' || status === 'sending';
    const isChecking  = status === 'sending' || status === 'success';
    const isDone      = status === 'success' && checkStep >= activeSteps.length;

    useEffect(() => {
        if (!isOpen) {
            setText(''); setFile(null); setPreview(null); setStatus('idle'); setCheckStep(0); setActiveSteps([]);
        } else {
            // 팝업 열릴 때: 답변 있으면 히스토리 뷰, 없으면 폼 뷰
            setView(inquiry?.replyText ? 'history' : 'form');
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => { if (preview) URL.revokeObjectURL(preview); };
    }, [preview]);

    // 1초마다 보안 체크 단계 진행 (전송 중 / 성공 상태에서 모두 동작)
    useEffect(() => {
        if (status !== 'sending' && status !== 'success') return;
        if (checkStep >= activeSteps.length) return;
        const timer = setTimeout(() => setCheckStep(s => s + 1), 1000);
        return () => clearTimeout(timer);
    }, [status, checkStep, activeSteps.length]);

    // 애니메이션 + API 모두 완료 시 자동 닫힘
    useEffect(() => {
        if (!isDone) return;
        const t = setTimeout(() => onClose(), 1500);
        return () => clearTimeout(t);
    }, [isDone]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const handleFileChange = async (e) => {
        const selected = e.target.files[0];
        if (!selected) return;
        e.target.value = '';
        setStatus('compressing');
        try {
            const compressed = await compressImage(selected);
            setFile(compressed);
            setPreview(URL.createObjectURL(compressed));
        } catch {
            alert('이미지 처리에 실패했습니다.');
        } finally {
            setStatus('idle');
        }
    };

    const handleSubmit = async () => {
        if (!text.trim() || isOverLimit || isBusy) return;
        const newId = generateUUID();
        // 실제 내용 기반으로 표시할 체크 단계만 추려서 설정
        const steps = ALL_STEPS.filter(s => s.check(text, !!file)).map(s => s.label);
        setActiveSteps(steps);
        setStatus('sending');
        try {
            await sendTelegramInquiry(text, file, newId);
            onSent?.(newId);
            setStatus('success');
        } catch (error) {
            const status = error?.response?.status;
            if (status === 429) {
                alert('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
            } else {
                alert('전송에 실패했습니다.');
            }
            setStatus('idle');
            setCheckStep(0);
            setActiveSteps([]);
        }
    };

    return ReactDOM.createPortal(
        <Overlay onClick={isChecking ? undefined : onClose}>
            <Container onClick={(e) => e.stopPropagation()}>

                {/* ── 헤더: 제목 + X ── */}
                <Header>
                    <Title>관리자에게 문의하기</Title>
                    <CloseBtn onClick={onClose} disabled={isBusy}>✕</CloseBtn>
                </Header>

                {isChecking ? (
                    /* ── 보안 체크 뷰 ── */
                    <CheckingBody>

                        <CheckingTitle $done={isDone}>
                            {isDone ? '전송 완료!' : '보안 검사 중...'}
                        </CheckingTitle>
                        <StepList>
                            {activeSteps.map((step, i) => {
                                const state = checkStep > i ? 'done' : checkStep === i ? 'active' : 'pending';
                                return (
                                    <StepItem key={step} $state={state}>
                                        <StepIcon $state={state}>
                                            {checkStep > i ? '✓' : checkStep === i ? '▸' : '·'}
                                        </StepIcon>
                                        <span>
                                            {step}
                                            {state === 'done' && ' 완료'}
                                            {state === 'active' && ' 검사 중...'}
                                        </span>
                                    </StepItem>
                                );
                            })}
                        </StepList>
                        <CheckingHint>
                            {isDone ? '메시지가 전송되었습니다' : '잠시만 기다려주세요'}
                        </CheckingHint>
                    </CheckingBody>
                ) : view === 'history' && inquiry?.replyText ? (
                    /* ── 히스토리 뷰: 이전 문의 + 관리자 답변 ── */
                    <HistoryBody>
                        <HistorySection>
                            <HistoryLabel>내 문의 ({formatDate(inquiry.createdAt)})</HistoryLabel>
                            <HistoryText>{inquiry.message}</HistoryText>
                        </HistorySection>
                        <HistoryDivider />
                        <HistorySection>
                            <HistoryLabel>관리자 답변 ({formatDate(inquiry.repliedAt)})</HistoryLabel>
                            <HistoryText $reply>{inquiry.replyText}</HistoryText>
                        </HistorySection>
                        <NewInquiryBtn onClick={() => setView('form')}>새 문의하기</NewInquiryBtn>
                    </HistoryBody>
                ) : (
                    /* ── 폼 뷰 ── */
                    <>
                        <SubText>에러 상황이나 궁금한 점을 남겨주세요.</SubText>

                        <TextArea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="내용을 입력하세요..."
                            disabled={isBusy}
                        />
                        <Counter $over={isOverLimit}>{remaining}자 남음</Counter>

                        {preview && (
                            <PreviewWrapper>
                                <PreviewImg src={preview} alt="첨부 이미지" />
                                <RemoveBtn onClick={() => { setFile(null); setPreview(null); }} disabled={isBusy}>✕</RemoveBtn>
                            </PreviewWrapper>
                        )}

                        <BottomRow>
                            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
                            <AttachBtn onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
                                {status === 'compressing' ? '압축 중...' : '📎 사진 첨부'}
                            </AttachBtn>
                            <BtnGroup>
                                <CancelBtn onClick={onClose} disabled={isBusy}>취소</CancelBtn>
                                <SendBtn onClick={handleSubmit} disabled={isBusy || isOverLimit || !text.trim()}>
                                    보내기
                                </SendBtn>
                            </BtnGroup>
                        </BottomRow>
                    </>
                )}

            </Container>
        </Overlay>,
        document.body
    );
};

export default TelegramPopup;

// ── Styled Components ──────────────────────────────────────────────────────────

const Overlay = styled.div`
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
    @media (max-width: 768px) { align-items: flex-end; }
`;

const Container = styled.div`
    display: flex; flex-direction: column;
    width: 420px; height: 400px;
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    color: #e2e8f0;
    overflow: hidden;
    @media (max-width: 768px) {
        width: 100%; height: auto; min-height: 400px;
        border-radius: 20px 20px 0 0;
    }
`;

const Header = styled.div`
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
`;

const Title = styled.span`
    font-size: 15px; font-weight: 600;
    color: #f1f5f9; letter-spacing: -0.01em;
`;

const CloseBtn = styled.button`
    background: none; border: none; cursor: pointer;
    color: #64748b; font-size: 16px; line-height: 1;
    padding: 2px 4px; border-radius: 4px;
    transition: color 0.15s;
    &:hover { color: #cbd5e1; }
`;

const SubText = styled.p`
    font-size: 12px; color: #64748b;
    padding: 10px 20px 0; margin: 0; flex-shrink: 0;
`;

const TextArea = styled.textarea`
    flex: 1;
    margin: 10px 20px 0;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
    color: #cbd5e1; font-size: 14px; line-height: 1.65;
    padding: 12px; resize: none;
    &::placeholder { color: #334155; }
    &:focus { outline: none; border-color: rgba(59, 130, 246, 0.4); }
`;

const Counter = styled.div`
    font-size: 11px; padding: 5px 20px 0;
    text-align: right; flex-shrink: 0;
    color: ${({ $over }) => $over ? '#f87171' : '#475569'};
`;

const PreviewWrapper = styled.div`
    position: relative; display: inline-block;
    margin: 8px 20px 0; flex-shrink: 0;
`;
const PreviewImg = styled.img`
    max-height: 80px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.1); display: block;
`;
const RemoveBtn = styled.button`
    position: absolute; top: 4px; right: 4px;
    background: rgba(0,0,0,0.6); color: white; border: none;
    border-radius: 50%; width: 18px; height: 18px;
    cursor: pointer; font-size: 10px;
    display: flex; align-items: center; justify-content: center;
`;

const BottomRow = styled.div`
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    margin-top: 10px; flex-shrink: 0;
    @media (max-width: 768px) { padding-bottom: 24px; }
`;

const AttachBtn = styled.button`
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8; border-radius: 6px;
    padding: 7px 13px; font-size: 13px; cursor: pointer;
    transition: all 0.15s;
    &:hover:not(:disabled) { border-color: rgba(255,255,255,0.25); color: #cbd5e1; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const BtnGroup = styled.div`display: flex; gap: 8px;`;

const CancelBtn = styled.button`
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8; border-radius: 6px;
    padding: 7px 18px; font-size: 14px; cursor: pointer;
    transition: all 0.15s;
    &:hover:not(:disabled) { border-color: rgba(255,255,255,0.2); color: #cbd5e1; }
    &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const SendBtn = styled.button`
    background: #3b82f6; color: white; border: none;
    border-radius: 6px; padding: 7px 20px;
    font-size: 14px; font-weight: 500; cursor: pointer;
    transition: background 0.15s;
    &:hover:not(:disabled) { background: #2563eb; }
    &:disabled { background: #1e3a5f; color: #475569; cursor: not-allowed; }
`;

// ── 보안 체크 뷰 ─────────────────────────────────────────────────────────────

const CheckingBody = styled.div`
    flex: 1;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 28px; padding: 24px;
`;

const CheckingTitle = styled.h3`
    font-size: 16px; font-weight: 600; margin: 0;
    color: ${({ $done }) => $done ? '#4ade80' : '#f1f5f9'};
    transition: color 0.4s;
`;

const StepList = styled.ul`
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 14px;
    width: 210px;
`;

const StepItem = styled.li`
    display: flex; align-items: center; gap: 10px;
    font-size: 14px;
    color: ${({ $state }) =>
        $state === 'done'   ? '#4ade80' :
        $state === 'active' ? '#e2e8f0' : '#334155'};
    transition: color 0.3s;
`;

const StepIcon = styled.span`
    font-size: 13px; width: 16px; text-align: center; flex-shrink: 0;
    color: ${({ $state }) =>
        $state === 'done'   ? '#4ade80' :
        $state === 'active' ? '#60a5fa' : '#334155'};
`;

const CheckingHint = styled.p`
    font-size: 12px; color: #64748b; margin: 0;
`;

// ── 히스토리 뷰 ──────────────────────────────────────────────────────────────

const HistoryBody = styled.div`
    flex: 1;
    display: flex; flex-direction: column;
    padding: 16px 20px 20px;
    gap: 16px;
    overflow-y: auto;
`;

const HistorySection = styled.div`
    display: flex; flex-direction: column; gap: 6px;
`;

const HistoryLabel = styled.span`
    font-size: 11px; color: #64748b;
`;

const HistoryText = styled.p`
    margin: 0;
    font-size: 14px; line-height: 1.65;
    color: ${({ $reply }) => $reply ? '#93c5fd' : '#cbd5e1'};
    background: #0f172a;
    border-radius: 8px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    white-space: pre-wrap;
`;

const HistoryDivider = styled.div`
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
`;

const NewInquiryBtn = styled.button`
    margin-top: auto;
    background: transparent;
    border: 1px solid rgba(59, 130, 246, 0.4);
    color: #60a5fa;
    border-radius: 6px;
    padding: 8px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { border-color: rgba(59, 130, 246, 0.7); color: #93c5fd; }
`;
