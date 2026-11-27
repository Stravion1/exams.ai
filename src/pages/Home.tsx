import { Cta } from '../sections/Cta'
import { ExamStrip } from '../sections/ExamStrip'
import { Faq } from '../sections/Faq'
import { Features } from '../sections/Features'
import { Hero } from '../sections/Hero'
import { HowItWorks } from '../sections/HowItWorks'
import { PricingPlans } from '../sections/PricingPlans'
import { Stats } from '../sections/Stats'
import { Testimonials } from '../sections/Testimonials'

export function Home() {
  return (
    <>
      <Hero />
      <ExamStrip />
      <Features />
      <HowItWorks />
      <Stats />
      <Testimonials />
      <PricingPlans />
      <Faq />
      <Cta />
    </>
  )
}
