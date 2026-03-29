<template>
  <section id="flavours" class="section relative overflow-hidden">
    <!-- Subtle sage/citrus ambient blob -->
    <div class="bg-orb" style="width:600px;height:600px;right:-200px;top:50%;transform:translateY(-50%);background:rgba(110,124,90,0.04);--duration:15s;" />

    <div class="relative z-10 max-w-6xl mx-auto px-6">
      <div class="text-center mb-16">
        <p class="font-display text-sm tracking-[0.4em] uppercase text-espresso/35 mb-3 italic">— The Lineup —</p>
        <div class="bistro-rule mb-4" />
        <h2 class="font-display text-5xl md:text-6xl font-bold holo-text">Flavours</h2>
        <div class="bistro-rule mt-4" />
      </div>

      <div class="grid md:grid-cols-2 gap-12 max-w-4xl mx-auto">
        <!-- Peach Lemon -->
        <div class="holo-card p-8 text-center group">
          <!-- Large can -->
          <div class="flex justify-center mb-6">
            <div class="can-visual">
              <div class="can-body mx-auto" style="background: linear-gradient(160deg, #ff9a56 0%, #ffcc70 30%, #ff6b9d 60%, #c44bdb 100%); box-shadow: 0 8px 50px rgba(255,154,86,0.35);">
                <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <span class="font-display text-[10px] tracking-widest text-white/80 uppercase mb-1">Eyes Tea</span>
                  <div class="w-10 h-px bg-white/30 mb-2" />
                  <span class="font-display text-sm font-bold text-white uppercase leading-tight">Peach<br/>Lemon</span>
                  <div class="w-10 h-px bg-white/30 mt-2 mb-2" />
                  <span class="text-[9px] text-white/50 tracking-wider">5% ABV · 330ml</span>
                </div>
              </div>
            </div>
          </div>
          <h3 class="font-display text-2xl font-bold text-espresso mb-2">Peach Lemon</h3>
          <p class="text-espresso/50 text-sm leading-relaxed mb-4 italic">
            Sun-ripened peach meets sharp citrus in this perfectly balanced tropical sip. Light, refreshing, dangerously easy to drink.
          </p>
          <div class="flex justify-center gap-2 flex-wrap">
            <span class="text-xs px-3 py-1 rounded-sm font-display" style="background: rgba(255,204,112,0.15); color: #a96e20; border: 1px solid rgba(255,204,112,0.4)">🍑 Peach</span>
            <span class="text-xs px-3 py-1 rounded-sm font-display" style="background: rgba(255,204,112,0.15); color: #a96e20; border: 1px solid rgba(255,204,112,0.4)">🍋 Lemon</span>
            <span class="text-xs px-3 py-1 rounded-sm font-display" style="background: rgba(255,204,112,0.15); color: #a96e20; border: 1px solid rgba(255,204,112,0.4)">🍵 Iced Tea</span>
          </div>
        </div>

        <!-- Raspberry Lemon -->
        <div class="holo-card p-8 text-center group">
          <div class="flex justify-center mb-6">
            <div class="can-visual" style="animation-delay: -2s;">
              <div class="can-body mx-auto" style="background: linear-gradient(160deg, #c0392b 0%, #e91e8c 30%, #9c27b0 60%, #3f0f6e 100%); box-shadow: 0 8px 50px rgba(192,57,43,0.3);">
                <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                  <span class="font-display text-[10px] tracking-widest text-white/80 uppercase mb-1">Eyes Tea</span>
                  <div class="w-10 h-px bg-white/30 mb-2" />
                  <span class="font-display text-sm font-bold text-white uppercase leading-tight">Raspberry<br/>Lemon</span>
                  <div class="w-10 h-px bg-white/30 mt-2 mb-2" />
                  <span class="text-[9px] text-white/50 tracking-wider">5% ABV · 330ml</span>
                </div>
              </div>
            </div>
          </div>
          <h3 class="font-display text-2xl font-bold text-espresso mb-2">Raspberry Lemon</h3>
          <p class="text-espresso/50 text-sm leading-relaxed mb-4 italic">
            Bold, punchy raspberry collides with electric lemon zest. Vibrant colour, even more vibrant taste. The one that turns heads.
          </p>
          <div class="flex justify-center gap-2 flex-wrap">
            <span class="text-xs px-3 py-1 rounded-sm font-display" style="background: rgba(192,57,43,0.1); color: #962835; border: 1px solid rgba(192,57,43,0.3)">🫐 Raspberry</span>
            <span class="text-xs px-3 py-1 rounded-sm font-display" style="background: rgba(192,57,43,0.1); color: #962835; border: 1px solid rgba(192,57,43,0.3)">🍋 Lemon</span>
            <span class="text-xs px-3 py-1 rounded-sm font-display" style="background: rgba(192,57,43,0.1); color: #962835; border: 1px solid rgba(192,57,43,0.3)">🍵 Iced Tea</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
