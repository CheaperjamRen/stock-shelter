import { ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** 全局合规声明：研究辅助定位、事实与推断区分、数据性质说明 */
export function ComplianceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif-sc">
            <ShieldAlert className="h-5 w-5 text-primary" aria-hidden />
            合规声明与使用边界
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm leading-relaxed text-foreground/85">
              <p>
                「研选」是面向 A 股投资研究场景的<b>研究辅助工具</b>，把自然语言选股意图转化为可检查、可修改、可执行的筛选条件。
                本工具<b>不构成任何投资建议</b>，不输出确定性涨跌预测、收益承诺或买卖建议。
              </p>
              <div className="space-y-1.5">
                <p className="font-medium">事实与推断的区分</p>
                <p>
                  界面中对每条结论均区分标签：数据字段数值、统计时点与来源属于<b>「客观事实」</b>；
                  筛选结果归属、What-if 边际影响、回测绩效等基于规则计算或演示假设的结论属于<b>「模型推断」</b>。
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="font-medium">数据性质</p>
                <p>
                  当前数据源为<b>内置演示数据快照</b>（确定性模拟生成，非实时行情），页面顶部以徽标显式标注。
                  数据缺失、过期或接口调用失败时，系统显式提示，绝不静默生成正常结论。
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="font-medium">关键数字可追溯</p>
                <p>所有关键数字均可追溯到具体字段、时点、单位与统计口径：指标名上标序号可查看口径卡片，明细核对单逐条展示实际值与数据时点。</p>
              </div>
              <p className="border-t pt-3 text-xs text-muted-foreground">
                投资有风险，入市需谨慎。任何依据本工具产出做出的决策，责任由使用者自行承担。
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
