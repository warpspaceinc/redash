import React from "react";
import DynamicComponent from "@/components/DynamicComponent";

import AIQuerySettings from "./AIQuerySettings";

export default function AISettings(props) {
  return (
    <DynamicComponent name="OrganizationSettings.AISettings" {...props}>
      <h3 className="m-t-0">AI Query Generation</h3>
      <hr />
      <AIQuerySettings {...props} />
    </DynamicComponent>
  );
}
