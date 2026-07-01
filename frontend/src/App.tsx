import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { pb } from "./lib/pb";
import { YearProvider } from "./lib/year";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Taxes from "./pages/Taxes";
import Remittances from "./pages/Remittances";
import Imports from "./pages/Imports";
import Expenses from "./pages/Expenses";
import ProfitDistributions from "./pages/ProfitDistributions";
import Config from "./pages/Config";

export default function App() {
  const [authed, setAuthed] = useState(pb.authStore.isValid);

  if (!authed) return <Login onAuth={() => setAuthed(true)} />;

  return (
    <YearProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="remessas" element={<Remittances />} />
          <Route path="importacoes" element={<Imports />} />
          <Route path="despesas" element={<Expenses />} />
          <Route path="lucros" element={<ProfitDistributions />} />
          <Route path="impostos" element={<Taxes />} />
          <Route path="config" element={<Config />} />
        </Route>
      </Routes>
    </YearProvider>
  );
}
