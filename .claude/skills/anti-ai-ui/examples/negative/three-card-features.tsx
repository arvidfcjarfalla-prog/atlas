// COUNTER-EXAMPLE — DO NOT EMIT THIS.
// Triggers tells.json items:
// - structural_tells: three_feature_cards_lucide_size_24_stroke_1_5
// - structural_tells: max_w_7xl_mx_auto_on_every_section
// - imports_to_flag: lucide-react size=24 strokeWidth=1.5
// - copy_banlist: "powerful", "seamlessly", "supercharge"
import { Zap, Shield, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ThreeCardFeaturesSlop() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <div className="grid grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <Zap size={24} strokeWidth={1.5} className="text-indigo-600" />
            <h3 className="mt-4 text-lg font-semibold">Lightning-fast</h3>
            <p className="mt-2 text-sm text-slate-600">Supercharge your workflow with our powerful engine.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Shield size={24} strokeWidth={1.5} className="text-indigo-600" />
            <h3 className="mt-4 text-lg font-semibold">Enterprise-grade</h3>
            <p className="mt-2 text-sm text-slate-600">Seamlessly integrates with your existing stack.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Sparkles size={24} strokeWidth={1.5} className="text-indigo-600" />
            <h3 className="mt-4 text-lg font-semibold">Beautifully crafted</h3>
            <p className="mt-2 text-sm text-slate-600">Built for the future of work.</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
