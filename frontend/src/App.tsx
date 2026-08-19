import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { pb } from "./lib/pb";
import { savedMode } from "./lib/mode";
import { YearProvider } from "./lib/year";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Taxes from "./pages/Taxes";
import Remittances from "./pages/Remittances";
import Imports from "./pages/Imports";
import Expenses from "./pages/Expenses";
import ProfitDistributions from "./pages/ProfitDistributions";
import Config from "./pages/Config";
import InvestSimulation from "./pages/InvestSimulation";
import Investments from "./pages/Investments";

// Landing route. The CNPJ Dashboard owns "/", so a reload while the Pessoa
// Física side was in use is bounced over to it. It has to be a component (not
// an inline ternary in the `element` prop): that prop is built when App
// renders, which a route change does not do, so the decision would be frozen
// at whatever the mode was on the first render.
function Home() {
  return savedMode() === "pf" ? <Navigate to="/pf" replace /> : <Dashboard />;
}

export default function App() {
  const [authed, setAuthed] = useState(pb.authStore.isValid);

  if (!authed) return <Login onAuth={() => setAuthed(true)} />;

  return (
    <YearProvider>
      <Routes>
        <Route element={<Layout />}>
          {/* Dashboard is the landing page of the CNPJ side: month + year
              summary + charts. */}
          <Route index element={<Home />} />
          <Route path="remessas" element={<Remittances />} />
          <Route path="importacoes" element={<Imports />} />
          <Route path="despesas" element={<Expenses />} />
          <Route path="lucros" element={<ProfitDistributions />} />
          <Route path="impostos" element={<Taxes />} />
          <Route path="config" element={<Config />} />

          {/* Pessoa Física: simulador de renda fixa + cadastro dos títulos. */}
          <Route path="pf" element={<InvestSimulation />} />
          <Route path="pf/investimentos" element={<Investments />} />
        </Route>
      </Routes>
    </YearProvider>
  );
}
