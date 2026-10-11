import PaymentCameraBase from '../../components/PaymentCamera';

export default function PaymentCamera({ onCapture, onClose }) {
  return <PaymentCameraBase onCapture={onCapture} onClose={onClose} />;
}
