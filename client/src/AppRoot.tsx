import { BrowserRouter } from "react-router-dom";
import App from "./App";

export default function AppRoot() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
