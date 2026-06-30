import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SocialStatsWidget from '../../src/components/SocialStatsWidget.vue'

describe('SocialStatsWidget', () => {
  it('renders social metrics and trend indicator', () => {
    const wrapper = mount(SocialStatsWidget, {
      props: {
        stats: [{
          provider: 'INSTAGRAM',
          totalViews: 50000,
          followerCount: 1200,
          engagementRate: 0.12,
          changeVsLastWeek: 12,
        }],
      },
    })

    expect(wrapper.text()).toContain('Instagram')
    expect(wrapper.text()).toContain('50,000')
    expect(wrapper.text()).toContain('▲ 12.00% vs last week')
  })
})
