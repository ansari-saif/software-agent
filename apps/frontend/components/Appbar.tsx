import { Button } from '@/components/ui/button'
import React from 'react'

const Appbar = () => {
  return (
    <div className="flex justify-between items-center p-4">
        <div>
            Bolty
        </div>
        <div>
            <Button>
                Login
            </Button>
        </div>
    </div>
  )
}

export default Appbar
