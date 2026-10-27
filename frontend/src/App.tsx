import { createCalculatorClient } from './api/calculatorClient';
import { Calculator } from './components/Calculator';

const api = createCalculatorClient();

export function App() {
  return <Calculator api={api} />;
}
