import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/cn";
import { TRANSITION } from "./classes";

/**
 * shadcn/ui Input (base-nova), re-skinned as the borderless field inside an
 * InputGroup, which draws the border. Sixteen-pixel text on phones keeps iOS
 * from zooming into the field.
 */
function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        TRANSITION,
        "h-10.5 w-full min-w-0 bg-transparent px-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:text-muted-foreground phone:text-xl phone:placeholder:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
