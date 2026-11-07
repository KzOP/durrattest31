import App from "./App";
import { ErrorBoundary } from "./components/error-boundary";

export default function DurratEntry() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
