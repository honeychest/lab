import WmsTab from './WmsTab';

export default function InboundTab(props) {
    return <WmsTab {...props} forcedMode="inbound" title="INBOUND 흐름" />;
}
