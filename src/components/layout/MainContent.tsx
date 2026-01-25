import { ReactNode } from 'react';

interface MainContentProps {
  menuSection: ReactNode;
  orderSection: ReactNode;
  chatSection?: ReactNode;
}

export function MainContent({ menuSection, orderSection, chatSection }: MainContentProps) {
  return (
    <main className="kiosk-main">
      <div className="menu-section">
        {menuSection}
      </div>
      <div className="order-section">
        {/* 주문 내역이 위, 채팅이 아래 */}
        {orderSection}
        {chatSection && (
          <div className="chat-section">
            {chatSection}
          </div>
        )}
      </div>
    </main>
  );
}
