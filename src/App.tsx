import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Stocks from './pages/Stocks';
import Picks from './pages/Picks';
import StockDetail from './pages/StockDetail';
import Ipos from './pages/Ipos';
import IpoDetail from './pages/IpoDetail';
import Screener from './pages/Screener';
import WeeklyTargets from './pages/WeeklyTargets';
import NotFound from './pages/NotFound';

// HashRouter keeps deep links working on any static host without rewrite rules.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="picks" element={<Picks />} />
          <Route path="stocks" element={<Stocks />} />
          <Route path="stocks/:market/:symbol" element={<StockDetail />} />
          <Route path="screener" element={<Screener />} />
          <Route path="ipo" element={<Ipos />} />
          <Route path="ipo/:id" element={<IpoDetail />} />
          <Route path="weekly-targets" element={<WeeklyTargets />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
